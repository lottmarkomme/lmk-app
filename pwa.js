(() => {
  'use strict';

  const installButton = document.getElementById('pwa-install-button');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  let installPrompt = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.warn('Service Worker konnte nicht registriert werden:', error);
      });
    });
  }

  if (!isStandalone && isIos) installButton.classList.remove('hidden');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    if (!isStandalone) installButton.classList.remove('hidden');
  });

  installButton.addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      installButton.classList.add('hidden');
      return;
    }

    if (isIos) {
      window.alert('So installierst du die App auf dem iPhone:\n\n1. Öffne diese Seite in Safari.\n2. Tippe unten auf „Teilen“.\n3. Wähle „Zum Home-Bildschirm“.\n4. Tippe auf „Hinzufügen“.');
    }
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.classList.add('hidden');
  });
})();
