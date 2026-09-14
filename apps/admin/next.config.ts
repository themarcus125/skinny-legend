import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // `@skinny/api-client` ships TypeScript source rather than dist/, so Next must compile it
  // (ruling R7). Its own dependency `@skinny/shared` is prebuilt JS and needs no entry here.
  transpilePackages: ['@skinny/api-client'],
};

export default withNextIntl(nextConfig);
