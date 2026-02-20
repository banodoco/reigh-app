import { renderApp } from '@/app/bootstrap';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Failed to render app: element with id 'root' was not found.");
}

renderApp(rootElement);
