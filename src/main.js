import React from 'react';
import * as ReactDOM from 'react-dom/client';

// The exported Design Canvas runtime expects React's UMD-style globals.
window.React = React;
window.ReactDOM = ReactDOM;

await import('../support.js');
