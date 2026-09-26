import { policyPage } from '../../server/src/legal-pages';

const standalonePage = policyPage(window.location.pathname);

if (standalonePage) {
  document.open();
  document.write(standalonePage);
  document.close();
} else {
  void import('./bootstrap');
}
