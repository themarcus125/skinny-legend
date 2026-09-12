import { getRequestConfig } from 'next-intl/server';
import { readLocale } from './locale';

export default getRequestConfig(async () => {
  const locale = await readLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
