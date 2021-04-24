const { Router } = require('tiny-request-router')
const createError = require('http-errors')
const Papa = require('papaparse')
const camelCase = require('lodash.camelcase')

const apiKeys = new Set(API_KEYS.split(','))

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

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

const cacheHeaders = {
  'Cache-Control': `max-age=${TTL}`,
}

const router = new Router()

router.get('/streams.json', async (requestURL) => {
  const key = requestURL.searchParams.get('key')

  let responseData = []
  if (apiKeys.has(key)) {
    const dateFilter = requestURL.searchParams.get('date')
    const streams = await fetchStreams({ dateFilter })
    responseData = streams.filter(({ link, platform }) => link && platform)
  }

  return new Response(JSON.stringify(responseData), {
    headers: {
      ...baseHeaders,
      ...cacheHeaders,
    },
  })
})

router.get('/stats.json', async () => {
  const streams = await fetchStreams()
  const responseData = {
    tracking: streams.length,
    live: streams.filter(({ status }) => status === 'Live').length,
  }
  return new Response(JSON.stringify(responseData), {
    headers: {
      ...baseHeaders,
      ...cacheHeaders,
    },
  })
})

addEventListener('fetch', async (event) => {
  const { request } = event
  const requestURL = new URL(request.url)

  const match = router.match(request.method, requestURL.pathname)

  let response

  try {
    if (match) {
      event.respondWith(match.handler(requestURL))
    } else {
      throw createError(404)
    }
  } catch (err) {
    if (createError.isHttpError(err)) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: baseHeaders,
      })
    }
    throw err
  }
})
