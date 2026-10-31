
(function () {
  'use strict';
  if (!window.firebase || !window.database) {
    console.error('[WIMB sync] Firebase is not initialized.');
    return;
  }

  const keyPaths = {
    wimb_management_data_v1: 'shared/managementData',
    wimb_demo_notices_v2: 'shared/notices',
    wimb_demo_pickups_v2: 'shared/pickups'
  };
  const originalSetItem = Storage.prototype.setItem;
  let applyingRemote = false;
  const refs = {};

  function parse(value) {
    try { return JSON.parse(value); } catch (_) { return value; }
  }

  Object.keys(keyPaths).forEach(function (key) {
    const path = keyPaths[key];
    const ref = window.database.ref(path);
    refs[key] = ref;

    ref.on('value', function (snapshot) {
      const remote = snapshot.val();
      const local = localStorage.getItem(key);
      if (remote === null) {
        if (local !== null) {
          ref.set(parse(local)).catch(function (error) {
            console.error('[WIMB sync] Could not upload ' + key + ':', error);
          });
        }
        return;
      }

      const remoteText = JSON.stringify(remote);
      if (local !== remoteText) {
        applyingRemote = true;
        originalSetItem.call(localStorage, key, remoteText);
        applyingRemote = false;
        window.dispatchEvent(new CustomEvent('wimb:data-updated', {
          detail: { key: key, path: path }
        }));
      }
    }, function (error) {
      console.error('[WIMB sync] Read failed for ' + path + ':', error);
      console.warn('[WIMB sync] Check Firebase Authentication and Realtime Database rules. Do not make the database public.');
    });
  });

  Storage.prototype.setItem = function (key, value) {
    originalSetItem.call(this, key, value);
    if (applyingRemote || !Object.prototype.hasOwnProperty.call(keyPaths, key)) return;
    const ref = refs[key];
    if (!ref) return;
    ref.set(parse(String(value))).catch(function (error) {
      console.error('[WIMB sync] Write failed for ' + key + ':', error);
      console.warn('[WIMB sync] Data is saved in this browser only until Firebase permissions are configured securely.');
    });
  };

  window.WIMBCloud = {
    seed: function (key, value) {
      const ref = refs[key];
      if (!ref) return Promise.resolve();
      return ref.once('value').then(function (snapshot) {
        if (snapshot.exists()) return;
        return ref.set(value);
      }).catch(function (error) {
        console.error('[WIMB sync] Initial seed failed for ' + key + ':', error);
      });
    }
  };

  console.log('[WIMB sync] Realtime sync bridge loaded.');
})();
