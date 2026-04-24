# PennyPilot final submission checklist

## Demo readiness

- [x] Local app starts on `http://localhost:4173`.
- [x] Public demo is live on Vercel.
- [x] UI shows Arc Testnet contract proof.
- [x] Compact 6-fact review completes under the `$0.25` policy budget.
- [x] Demo report generated at `reports/pennypilot-demo-report.json`.
- [x] Arc Testnet proof verifies with `npm run contracts:verify:arc`.
- [x] 50+ on-chain transaction proof verifies with `npm run contracts:verify-50:arc`.
- [x] Solidity contracts compile with `npm run contracts:compile`.
- [x] App tests pass with `npm test`.

## Hackathon requirements

- [x] Clear nano-payment use case for autonomous AI agents.
- [x] Per-action pricing stays below `$0.01`.
- [x] Economic justification explains why traditional high-fee paths break the use case.
- [x] Circle Gateway x402 path is integrated for paid provider calls.
- [x] Arc Testnet contract is deployed.
- [x] Arc Block Explorer proof links are documented.
- [x] 50+ Arc transactions are recorded and verifier-backed.
- [x] Circle product feedback is written in `docs/circle-feedback-draft.md`.
- [ ] Final video uploaded.
- [x] Public GitHub URL prepared: https://github.com/Kxazar/pennypilot

## Proof links

- Demo: https://pennypilot-five.vercel.app
- GitHub: https://github.com/Kxazar/pennypilot
- Contract: https://testnet.arcscan.app/address/0x4c8e7ae58d71130185de198af9285e65bb333047
- Deploy tx: https://testnet.arcscan.app/tx/0x5bb0754c0b95421797eae3bcd96199ab55f8534e59bdf36c9a5b218e4849a1bb
- Policy task tx: https://testnet.arcscan.app/tx/0x86a4d76dddead84017d1d49c585c1cf8e647b53564832e7809b77b3f788eb63b
- Anchored receipt tx: https://testnet.arcscan.app/tx/0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996
- 50 tx task: https://testnet.arcscan.app/tx/0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7
- 50 tx report: `deployments/arc-testnet-50tx.json`

## GitHub package

- [x] README has product story, run commands, demo script, proof links, and real funding notes.
- [x] `.env.example` documents required local variables without secrets.
- [x] Deployment artifacts are public and contain no private keys.
- [x] Generated contract artifacts are ignored by `.gitignore`.
- [x] MIT `LICENSE` is present.
- [x] Cover image asset is prepared.
- [x] Final presentation deck is prepared.
- [ ] Add final screenshots or video link after upload.
- [x] Push to public GitHub repository.

## Arc forum package

- [x] Final copy: `docs/arc-forum-draft.md`.
- [x] Add demo link.
- [x] Add GitHub link.
- [ ] Add recorded video link.
- [ ] Add final product screenshots.

## Twitter/X package

- [x] Final copy: `docs/twitter-draft.md`.
- [x] Visual asset: `assets/pennypilot-twitter-card.svg`.
- [x] Add demo link.
- [x] Add final GitHub link.
- [ ] Add final video link if posting after upload.

## Presentation package

- [x] Final deck: `presentation/PennyPilot-hackathon-demo.pptx`.
- [x] Final PDF: `presentation/PennyPilot-hackathon-demo.pdf`.
- [x] Preview PNGs generated for QA.
- [ ] Add optional wallet-run screenshots to social/forum posts after final UI capture.

## Submission support

- [x] Video recording script: `docs/video-script.md`.
- [x] Circle feedback copy: `docs/circle-feedback-draft.md`.
- [x] Circle Gateway x402 path integrated into the live app.
- [ ] Record the required video presentation.
- [ ] Record the required transaction-flow demo through Circle Developer Console and Arc explorer.

## Final run order

```bash
npm install
npm run contracts:compile
npm test
npm run contracts:verify:arc
npm run contracts:verify-50:arc
npm run dev
```

Open `http://localhost:4173`, show the proof panel, then run the review.
