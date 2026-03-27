import type { ZodType } from "zod";

export const parseWithSchema = <T>(
  schema: ZodType<T>,
  payload: unknown
): T => schema.parse(payload);

export const parseJsonWithSchema = <T>(
  schema: ZodType<T>,
  raw: string
): T => parseWithSchema(schema, JSON.parse(raw));
