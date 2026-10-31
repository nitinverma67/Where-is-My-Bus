const firebaseConfig = {
  apiKey: "AIzaSyD2S-t3Pw2_s-MchYp0Lf8emeHQKaqnqzM",
  authDomain: "where-is-my-project-01.firebaseapp.com",
  databaseURL: "https://where-is-my-project-01-default-rtdb.firebaseio.com",
  projectId: "where-is-my-project-01",
  storageBucket: "where-is-my-project-01.firebasestorage.app",
  messagingSenderId: "633017050169",
  appId: "1:633017050169:web:e9cd3a8dbf21f7752cd9e8",
  measurementId: "G-XYVM8NE6JY"
};

firebase.initializeApp(firebaseConfig);

window.database = firebase.database();

console.log("Firebase initialized:", firebase.app().name);
console.log("Database URL:", firebase.app().options.databaseURL);