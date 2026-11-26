// oramara/backend/src/routes/wrap.js
// Passes async errors to the Express error handler
export function wrap(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  }
  
  export function badRequest(message) {
    const err = new Error(message);
    err.status = 400;
    err.expose = true;
    return err;
  }