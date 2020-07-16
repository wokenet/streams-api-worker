# streams-api-worker

A Cloudflare worker which powers the woke.net streams API.

Based on https://github.com/chromakode/sheet2json-worker.


## Endpoints:

### https://woke.net/api/streams.json

Fetch information about current and recently live streams.

### https://woke.net/api/streams.json?date=YYYY-MM-DD

Fetch historical information about live streams for the date specified.

### https://woke.net/api/stats.json

Fetch stats of current stream counts.
