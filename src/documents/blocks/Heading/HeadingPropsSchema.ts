import { z } from 'zod';

import { HeadingPropsSchema as BaseHeadingPropsSchema } from 'monto-email-block-heading';

/**
 * monto-email-block-heading schema plus `props.variableDefaults`.
 * Heading text is plain, so variables are the `{{name}}` / `{%name%}` tokens in `props.text`;
 * defaults are keyed by variable name (one default per name per heading).
 */
const HeadingPropsSchema = BaseHeadingPropsSchema.extend({
  props: z
    .object({
      text: z.string().optional().nullable(),
      level: z.enum(['h1', 'h2', 'h3']).optional().nullable(),
      variableDefaults: z.record(z.string()).optional().nullable(),
    })
    .optional()
    .nullable(),
});

export default HeadingPropsSchema;
export type HeadingProps = z.infer<typeof HeadingPropsSchema>;
