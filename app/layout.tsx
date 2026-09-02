import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '국제처 업무·인수인계 | 숭실대학교',
  description: '숭실대학교 국제처의 연간 업무 일정과 인수인계를 한곳에서 관리하는 교직원 업무 시스템',
};

export const viewport: Viewport = {
  themeColor: '#0e3658',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /*
    The font variables belong on `<html>`, not on `<body>`. `--sans` is declared on `:root` and
    names `var(--font-geist-sans)` inside it, and a custom property is substituted where it is
    declared: with the variable one level lower that lookup failed, `--sans` computed to nothing,
    and `font-family: var(--sans)` was dropped from every element on the page — the whole interface
    fell back to the browser's default face instead of Pretendard.
  */
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {/*
          Korean display type carries this interface, and Geist has no Hangul. Pretendard is the
          Korean face the reference design language is built on, so it is loaded first and Geist
          stays behind it for latin numerals.
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
