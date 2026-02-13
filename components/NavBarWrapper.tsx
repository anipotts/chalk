'use client';

import { usePathname } from 'next/navigation';
import NavBar from './NavBar';

export default function NavBarWrapper() {
  const pathname = usePathname();

  // Don't render NavBar on homepage or watch page (watch has its own header)
  if (pathname === '/' || pathname.startsWith('/watch')) return null;

  return <NavBar />;
}
