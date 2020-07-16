const createError = require('http-errors')
const Papa = require('papaparse')
const camelCase = require('lodash.camelcase')

function parseCSV(csvString, config) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvString, {
      ...config,
      complete: ({ data }) => resolve(data),
      error: reject,
    })
  })
}

async function fetchStreams({ dateFilter } = {}) {
  let dataURL
  if (dateFilter) {
    if (!dateFilter.match(/^\d\d\d\d-\d\d?-\d\d?$/)) {
      throw createError(400, 'invalid date')
    }
    const query = `SELECT * WHERE dateDiff(L, date "${dateFilter}") = 0`
    dataURL = `https://docs.google.com/spreadsheets/d/${DOC_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(
      ALL_SHEET_NAME,
    )}&tq=${encodeURIComponent(query)}`
  } else {
    dataURL = `https://docs.google.com/spreadsheets/d/${DOC_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(
      CURRENT_SHEET_NAME,
    )}`
  }

  const resp = await fetch(dataURL, {
    cf: {
      cacheTtl: Number(TTL), // seconds
    },
  })
  if (!resp.ok) {
    throw createError(500, 'failed to fetch data from backend')
  }

  const csv = await resp.text()

  const rows = await parseCSV(csv, {
    header: true,
    transformHeader: camelCase,
  })

  return rows
}

async function handleRequest(requestURL) {
  const { pathname } = requestURL

  let responseData
  try {
    if (pathname.endsWith('stats.json')) {
      const streams = await fetchStreams()
      responseData = {
        tracking: streams.length,
        live: streams.filter(({ status }) => status === 'Live').length,
      }
    } else if (pathname.endsWith('streams.json')) {
      const dateFilter = requestURL.searchParams.get('date')
      const streams = await fetchStreams({ dateFilter })
      responseData = streams.filter(({ link, platform }) => link && platform)
    } else {
      throw createError(404)
    }
  } catch (err) {
    if (createError.isHttpError(err)) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
    throw err
  }

  response = new Response(JSON.stringify(responseData), {
    headers: {
      'Cache-Control': `max-age=${TTL}`,
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
  return response
}

addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  event.respondWith(handleRequest(url))
})
