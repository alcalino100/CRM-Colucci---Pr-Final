import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'
import { fetchBrandServer } from '@/lib/brand-server'
import { BRAND_DEFAULTS } from '@/lib/master'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jakarta = Space_Grotesk({ subsets: ['latin'], variable: '--font-jakarta' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

export async function generateMetadata(): Promise<Metadata> {
  const brand = await fetchBrandServer().catch(() => BRAND_DEFAULTS)
  return {
    title: `${brand.brand_name} — CRM`,
    description: `CRM de leads, visitas e propostas — ${brand.brand_name}`,
    generator: 'v0.app',
    icons: brand.favicon_url ? { icon: brand.favicon_url } : undefined,
  }
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await fetchBrandServer().catch(() => BRAND_DEFAULTS)
  return {
    colorScheme: 'light',
    themeColor: brand.cor_primaria,
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const brand = await fetchBrandServer().catch(() => BRAND_DEFAULTS)
  const bootStyle = [
    `--primary:${brand.cor_primaria}`,
    `--sidebar:${brand.sidebar_bg}`,
    `--sidebar-foreground:${brand.sidebar_fg}`,
    `--sidebar-accent:${brand.sidebar_accent}`,
    `--sidebar-border:${brand.sidebar_accent}`,
  ].join(";")
  const bootJson = JSON.stringify({
    brand_name: brand.brand_name,
    logo_url: brand.logo_url,
    cor_primaria: brand.cor_primaria,
    fonte_titulo: brand.fonte_titulo,
    fonte_texto: brand.fonte_texto,
  }).replace(/</g, "\\u003c")
  return (
    <html lang="pt-BR" className={`${inter.variable} ${jakarta.variable} ${jetbrains.variable} bg-background`} style={{ ["--primary" as string]: brand.cor_primaria }}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root{${bootStyle}}` }} />
        <script dangerouslySetInnerHTML={{ __html: `window.__BRAND__=${bootJson}` }} />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
