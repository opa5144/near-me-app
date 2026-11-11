const stores = require('../services/storeService');
const { getAuthContext, apiBaseUrl, sendServiceError } = require('./controllerUtils');

async function listStores(req, res) {
  try { return res.json({ stores: await stores.listPublicStores(apiBaseUrl(req)) }); }
  catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Store list failed:', error.name);
    return res.status(500).json({ message: 'Unable to load stores. Please try again.' });
  }
}

async function listOwnedStores(req, res) {
  try { return res.json({ stores: await stores.listOwnedStores(getAuthContext(req), apiBaseUrl(req)) }); }
  catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load your stores.' });
  }
}

async function getStore(req, res) {
  try { return res.json({ store: await stores.getStore(req.params.id, apiBaseUrl(req)) }); }
  catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load this store.' });
  }
}

async function getPhoto(req, res) {
  try {
    const photo = await stores.getStorePhoto(req.params.id, req.params.photoId);
    if (!photo) return res.sendStatus(404);
    res.set('Content-Type', photo.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(photo.data);
  } catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load this store photo.' });
  }
}

async function createStore(req, res) {
  try { return res.status(201).json({ store: await stores.createStore(getAuthContext(req), req.body, apiBaseUrl(req)) }); }
  catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Store creation failed:', error.name);
    return res.status(500).json({ message: 'Unable to create your store. Please try again.' });
  }
}

module.exports = { listStores, listOwnedStores, getStore, getPhoto, createStore };
