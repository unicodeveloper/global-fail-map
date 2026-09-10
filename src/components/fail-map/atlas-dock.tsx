'use client';

import Image from 'next/image';
import { BookOpen, History, Info, LogIn, LogOut, Shuffle } from 'lucide-react';

interface AtlasDockProps {
  onHome: () => void;
  onStories: () => void;
  onHistory: () => void;
  onAbout: () => void;
  onRandom?: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  signedIn: boolean;
  selfHosted: boolean;
  connecting: boolean;
}

export function AtlasDock(props: AtlasDockProps) {
  return (
    <nav className="atlas-dock" aria-label="Atlas navigation">
      <button className="dock-item" onClick={props.onHome} aria-label="Home">
        <Image src="/favicon-64.png" alt="" width={25} height={25} />
        <span className="dock-tooltip">Home</span>
      </button>
      <span className="dock-divider" />
      <button
        className="dock-item"
        onClick={props.onStories}
        aria-label="Browse stories"
      >
        <BookOpen size={21} />
        <span className="dock-tooltip">Stories</span>
      </button>
      <button
        className="dock-item"
        onClick={props.onHistory}
        aria-label="My research"
      >
        <History size={21} />
        <span className="dock-tooltip">My research</span>
      </button>
      <span className="dock-divider" />
      <button
        className="dock-item"
        onClick={props.onAbout}
        aria-label="About this atlas"
      >
        <Info size={21} />
        <span className="dock-tooltip">About</span>
      </button>
      {props.onRandom && (
        <button
          className="dock-item is-random"
          onClick={props.onRandom}
          aria-label="Open a random story"
        >
          <Shuffle size={21} />
          <span className="dock-tooltip">Random story</span>
        </button>
      )}
      {!props.selfHosted && (
        <button
          className="dock-item"
          onClick={props.signedIn ? props.onDisconnect : props.onConnect}
          disabled={props.connecting}
          aria-label={props.signedIn ? 'Sign out' : 'Connect Valyu'}
        >
          {props.signedIn ? <LogOut size={21} /> : <LogIn size={21} />}
          <span className="dock-tooltip">
            {props.signedIn ? 'Sign out' : 'Connect Valyu'}
          </span>
        </button>
      )}
    </nav>
  );
}
