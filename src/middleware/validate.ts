import type { RequestHandler } from "express";
import type { ZodType } from "zod";

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/* Higher-order middleware. */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    schemas.params?.parse(req.params);
    if (schemas.query) {
      // Express 5 exposes
      Object.defineProperty(req, "query", {
        value: schemas.query.parse(req.query),
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    next();
  };
