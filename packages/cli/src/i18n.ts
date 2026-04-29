import {
  createTranslator,
  loadLocaleMessages,
  type Locale,
  type MessageParams,
} from "@looki-ai/openclaw-looki/shared";

export type Translator = (key: string, params?: MessageParams) => string;

export const MESSAGES = loadLocaleMessages();

export function makeTranslator(
  getLocale: () => Locale,
  globalParams: MessageParams = {},
): Translator {
  return createTranslator(MESSAGES, getLocale, globalParams);
}
