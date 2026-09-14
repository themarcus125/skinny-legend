import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // `@skinny/api-client` and `@skinny/ui` ship TypeScript source rather than dist/, so Next must
  // compile them (ruling R7). `@skinny/shared` is prebuilt JS and needs no entry here.
  transpilePackages: ['@skinny/api-client', '@skinny/ui'],
};

export default withNextIntl(nextConfig);
