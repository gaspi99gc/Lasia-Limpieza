/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist se carga como módulo Node externo (sin bundlear) para que
  // encuentre su worker en tiempo de ejecución dentro de /api/recibos/split.
  serverExternalPackages: ['pdfjs-dist'],
};

export default nextConfig;
