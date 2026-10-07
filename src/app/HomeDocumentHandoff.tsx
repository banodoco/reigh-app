import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

type ReplaceDocument = (url: string) => void;

interface HomeDocumentHandoffProps {
  replaceDocument?: ReplaceDocument;
}

export function buildHomeDocumentHandoffUrl(
  location: Pick<Location, 'search' | 'hash'>,
  origin: string,
): string {
  const target = new URL('/home', origin);
  target.search = location.search;
  target.hash = location.hash;
  return target.href;
}

export function HomeDocumentHandoff({
  replaceDocument = (url) => window.location.replace(url),
}: HomeDocumentHandoffProps) {
  const location = useLocation();

  useEffect(() => {
    replaceDocument(buildHomeDocumentHandoffUrl(location, window.location.origin));
  }, [location.hash, location.search, replaceDocument]);

  return null;
}
