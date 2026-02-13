'use client';

import { usePathname } from 'next/navigation';
import NavBar from './NavBar';

export default function NavBarWrapper() {
  const pathname = usePathname();

  // Don't render NavBar on homepage
  if (pathname === '/') return null;

  return <NavBar />;
}
