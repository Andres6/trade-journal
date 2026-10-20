// Finnhub's free tier allows ~60 calls/minute, so only one Finnhub-backed
// sync (earnings or news) may run at a time across the whole server.
let busy = false;

module.exports = {
  tryAcquire() {
    if (busy) return false;
    busy = true;
    return true;
  },
  release() {
    busy = false;
  },
  isBusy() {
    return busy;
  },
};
