import type {NextConfig} from 'next';
const config: NextConfig = {reactStrictMode: true, poweredByHeader: false, transpilePackages: ['@law-machine/contracts','@law-machine/presentation','@law-machine/sdk']};
export default config;
