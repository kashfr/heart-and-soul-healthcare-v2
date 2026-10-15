'use strict';
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { onDocumentWrittenWithAuthContext } = require('firebase-functions/v2/firestore');
const { capture } = require('./audit');
initializeApp();
exports.captureClientActivity = onDocumentWrittenWithAuthContext({document:'{document=**}',region:'us-central1',retry:true,maxInstances:5,memory:'256MiB',timeoutSeconds:120},event=>capture(event,getFirestore(),Timestamp));
