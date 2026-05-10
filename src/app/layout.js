import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { CatalogProvider } from '@/lib/CatalogContext';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata = {
  title: 'LASIA Supervición',
  description: 'Sistema de Gestión LASIA para Supervisores',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <CatalogProvider>
          {children}
        </CatalogProvider>
      </body>
    </html>
  );
}
