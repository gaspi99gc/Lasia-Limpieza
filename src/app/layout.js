import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { CatalogProvider } from '@/lib/CatalogContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import QueryProvider from '@/components/providers/QueryProvider';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata = {
  title: 'LASIA Supervisión',
  description: 'Sistema de Gestión LASIA para Supervisores',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0f172a" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var t = localStorage.getItem('themeMode');
              if (t === 'dark' || t === 'light') {
                document.documentElement.dataset.theme = t;
                document.documentElement.style.colorScheme = t;
              }
            } catch(e) {}
          })();
        ` }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider>
          <QueryProvider>
            <CatalogProvider>
              {children}
            </CatalogProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
