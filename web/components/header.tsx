/**
 * Copyright 2021 Weasel, Inc. All rights reserved.
 */

import Link from 'next/link';

export default function Header() {
  return (
    <header className="h-20 sticky top-0 z-10 bg-primary-900 bg-opacity-90 backdrop-filter backdrop-blur">
      <div className="px-4 mx-auto container flex justify-between">
        <div className="flex items-center select-none">
          <Link href="/">
            <a className="h-20 flex items-center focus:outline-none">
              <img
                className="h-12"
                src="/logo/weasel-logo-transparent.svg"
                alt="Weasel Logo"
              />
              <h1 className="text-2xl font-light text-white tracking-tight">
                Weasel
              </h1>
            </a>
          </Link>
        </div>
        <nav className="flex items-center space-x-4">
          <Link href="/pricing">
            <a className="wsl-header-btn-secondary">Pricing</a>
          </Link>
          <a
            className="wsl-header-btn-secondary"
            href="https://docs.getweasel.com"
            target="_blank">
            Docs
          </a>
          <a
            className="wsl-header-btn-primary"
            href="https://app.getweasel.com">
            Get Started
          </a>
        </nav>
      </div>
    </header>
  );
}
