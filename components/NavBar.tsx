'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { AnimatePresence } from 'framer-motion';
import SearchDropdown from './SearchDropdown';

export default function NavBar() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/?q=${encodeURIComponent(searchValue.trim())}`);
      setSearchValue('');
      setShowMobileSearch(false);
    }
  };

  const handleFocus = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    setIsFocused(true);
    setShowDropdown(searchValue.length === 0);
  };

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsFocused(false);
      setShowDropdown(false);
    }, 150);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
    setShowDropdown(e.target.value.length === 0);
  };

  const handleTopicSelect = (topic: string) => {
    setSearchValue(topic);
    setShowDropdown(false);
    router.push(`/?q=${encodeURIComponent(topic)}`);
  };

  return (
    <nav className="sticky top-0 z-50 h-12 flex items-center px-4 bg-chalk-bg/80 backdrop-blur-md border-b border-chalk-border/30">
      {/* Left: Logo */}
      <a
        href="/"
        onClick={(e) => { e.preventDefault(); router.push('/'); }}
        className="text-chalk-text font-semibold text-sm lowercase hover:opacity-80 transition-opacity shrink-0"
      >
        chalk
      </a>

      {/* Center: Search input (desktop) */}
      <div className="flex-1 flex justify-center">
        <div className="relative hidden md:block w-full max-w-sm">
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] focus-within:ring-1 focus-within:ring-chalk-accent/40 focus-within:border-chalk-accent/30 transition-colors">
              <MagnifyingGlass size={14} className="text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="Search videos, channels..."
                className="flex-1 bg-transparent text-sm text-chalk-text placeholder:text-slate-600 focus:outline-none"
              />
            </div>
          </form>
          <AnimatePresence>
            {showDropdown && isFocused && (
              <SearchDropdown
                isVisible={true}
                onSelectTopic={handleTopicSelect}
                compact
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile: Search icon */}
      <button
        onClick={() => {
          setShowMobileSearch(!showMobileSearch);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="md:hidden p-2 text-slate-400 hover:text-chalk-text transition-colors ml-auto"
        aria-label="Search"
      >
        <MagnifyingGlass size={18} />
      </button>

      {/* Mobile expanded search */}
      {showMobileSearch && (
        <div className="absolute inset-x-0 top-12 bg-chalk-bg/95 backdrop-blur-md border-b border-chalk-border/30 p-3 md:hidden z-50">
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]">
              <MagnifyingGlass size={14} className="text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="Search videos, channels..."
                className="flex-1 bg-transparent text-sm text-chalk-text placeholder:text-slate-600 focus:outline-none"
              />
            </div>
          </form>
        </div>
      )}

      {/* Right side empty for now */}
      <div className="hidden md:block w-12 shrink-0" />
    </nav>
  );
}
