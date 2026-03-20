'use strict';

const { defineClashProvider } = require('surgio');

const subscriptionUrl = process.env.AIRPORT_SUBSCRIPTION_URL;

if (!subscriptionUrl) {
  throw new Error('AIRPORT_SUBSCRIPTION_URL is required.');
}

module.exports = defineClashProvider({
  url: subscriptionUrl,
  udpRelay: true,
});

