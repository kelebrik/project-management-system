import { z } from 'zod';

/**
 * The schema of a change to an object: every field optional and no defaults.
 * zod's partial() keeps defaults, so a change that sends one field would also
 * write the defaults of all the others (a risk back to OPEN, a shared view back
 * to private, a project back to GREEN).
 */
export function patchSchema<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      ((field instanceof z.ZodDefault ? field.removeDefault() : field) as z.ZodType).optional(),
    ]),
  );
  // The same fields, all optional: the shape partial() gives, without its defaults.
  return z.object(shape) as unknown as ReturnType<z.ZodObject<Shape>['partial']>;
}
