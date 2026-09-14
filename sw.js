// ============================================================
// Service Worker — 离线缓存 + 消息中转
// 版本号便于后续更新训练数据后让用户拿到新计划
// ============================================================

const SW_VERSION = 'v1.0.0';
const CACHE_NAME = `badminton-training-${SW_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './style.css',
  './js/data.js',
  './js/demo.js',
  './js/timer.js',
  './js/alarm.js',
  './js/app.js'
];

// 安装：预缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        // 单个资源失败不阻断整体
        console.warn('SW 缓存部分资源失败', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求：缓存优先,失败回退到网络
self.addEventListener('fetch', event => {
  // 仅处理同源 GET
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // 后台更新
        fetch(req).then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(req, resp));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(resp => {
        // 缓存新资源
        if (resp && resp.status === 200) {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, respClone));
        }
        return resp;
      }).catch(() => {
        // 离线回退到首页
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// 消息中转：接收来自页面的通知请求
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'showNotification') {
    if (Notification.permission === 'granted') {
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: 'icon.svg',
        badge: 'icon.svg',
        vibrate: [200, 100, 200, 100, 200, 100, 400],
        tag: 'training-alarm',
        requireInteraction: true
      });
    }
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 通知点击：聚焦窗口
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
