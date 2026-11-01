import { createElement, Fragment } from 'react';
import { z } from 'zod';

import { ButtonPropsSchema } from 'monto-email-block-button';
import { DividerPropsSchema } from 'monto-email-block-divider';
import { HtmlPropsSchema } from 'monto-email-block-html';
import { ImagePropsSchema } from 'monto-email-block-image';
import { SpacerPropsSchema } from 'monto-email-block-spacer';
import { TextPropsSchema } from 'monto-email-block-text';
import { buildBlockConfigurationDictionary, buildBlockConfigurationSchema } from 'monto-email-document-core';

import ColumnsContainerPropsSchema from '../blocks/ColumnsContainer/ColumnsContainerPropsSchema';
import ContainerPropsSchema from '../blocks/Container/ContainerPropsSchema';
import EmailLayoutPropsSchema from '../blocks/EmailLayout/EmailLayoutPropsSchema';
import HeadingPropsSchema from '../blocks/Heading/HeadingPropsSchema';
import SocialsPropsSchema from '../blocks/Socials/SocialsPropsSchema';
import VideoPropsSchema from '../blocks/Video/VideoPropsSchema';

/**
 * The same block types/schemas as EDITOR_DICTIONARY in ./core.tsx, kept in its own module so
 * deriving a JSON Schema (scripts/export-schema.mjs, run in plain Node) never has to load the
 * Editor React components -- those pull in MUI/CodeMirror, which only resolve inside a bundler,
 * not a bare Node ESM import. buildBlockConfigurationSchema only ever reads `.schema` off each
 * entry (never `.Component`), so a no-op Component here produces an identical schema to core.tsx.
 *
 * If you add/remove a block type in core.tsx's EDITOR_DICTIONARY, mirror it here too.
 */
const noop = () => createElement(Fragment);
const SCHEMA_ONLY_DICTIONARY = buildBlockConfigurationDictionary({
  Button: { schema: ButtonPropsSchema, Component: noop },
  Container: { schema: ContainerPropsSchema, Component: noop },
  ColumnsContainer: { schema: ColumnsContainerPropsSchema, Component: noop },
  Heading: { schema: HeadingPropsSchema, Component: noop },
  Html: { schema: HtmlPropsSchema, Component: noop },
  Image: { schema: ImagePropsSchema, Component: noop },
  Video: { schema: VideoPropsSchema, Component: noop },
  Text: { schema: TextPropsSchema, Component: noop },
  EmailLayout: { schema: EmailLayoutPropsSchema, Component: noop },
  Spacer: { schema: SpacerPropsSchema, Component: noop },
  Divider: { schema: DividerPropsSchema, Component: noop },
  Socials: { schema: SocialsPropsSchema, Component: noop },
});

export const EditorBlockSchema = buildBlockConfigurationSchema(SCHEMA_ONLY_DICTIONARY);
export const EditorConfigurationSchema = z.record(z.string(), EditorBlockSchema);
