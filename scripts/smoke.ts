import { DecisionClient, loadConfig } from '../src/client.js';

// Explicitly opt in with npm run test:live. Makes one billed inference request.
const client = new DecisionClient(loadConfig());
const start = performance.now();
const result = await client.decide({
  state: 'Checkout is down for all customers. Every payment attempt returns HTTP 500.',
  questions: {
    is_outage: { type: 'noul', instructions: 'Does this describe an outage?' },
    team: { type: 'choice', instructions: 'Which team should investigate?', criteria: {
      engineering: 'Bugs, errors, outages', billing: 'Invoices and refund questions', unknown: 'Insufficient information',
    } },
    severity: { type: 'score', instructions: 'How severe is the incident?', criteria: ['Cosmetic', 'Minor', 'Major', 'Critical'] },
  },
});
console.log(JSON.stringify({ elapsed_ms: Math.round(performance.now() - start), ...result }, null, 2));
