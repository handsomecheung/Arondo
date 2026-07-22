import { MetadataRoute } from 'next'

// This manifest configuration allows the web application to be recognized as an installable PWA
// (Progressive Web App) by mobile browsers like Android Chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Arondo',
    short_name: 'Arondo',
    description: 'Arondo Web Application',
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
    ],
  }
}
