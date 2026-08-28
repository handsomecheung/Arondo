import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  const title = process.env.ARONDO_TITLE ?? "Arondo";
  return {
    name: title,
    short_name: title,
    description: title + ' Web Application',
    start_url: '/',
    display: 'standalone', // Makes the app run in a standalone window, not as a shortcut
    background_color: '#ffffff',
    theme_color: '#10B9B3', // Matches the teal color in the SVG logo
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
