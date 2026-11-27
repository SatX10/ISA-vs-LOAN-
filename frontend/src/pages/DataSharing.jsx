import { Link } from 'react-router-dom';

export default function DataSharing() {
  return <div className="reading-width">
    <header className="page-header"><h1>Data and sharing</h1><p>See what ISA Truth stores and what a reviewer can see.</p></header>
    <section className="card section-block">
      <h2 className="section-title">Your browser and account</h2>
      <p>The browser workspace saves your offers, comparisons, and local payment logs on this device. When you save to an account, the account workspace stores a separate copy. The account spending ledger stores expenses and linked loan payments.</p>
    </section>
    <section className="card section-block">
      <h2 className="section-title">Exporting and sharing</h2>
      <p>Workspace reports omit salary and repayment budget by default. Anyone with a public comparison link can see the summary it contains. Private reports give the invited account read-only access. You can revoke private access in your workspace.</p>
      <p className="section-top">Check the offer names and other visible fields before sharing. If you include salary or budget in a private report, the recipient can see those values.</p>
    </section>
    <section className="card section-block">
      <h2 className="section-title">AI features</h2>
      <p>When you enable AI, the relevant feature sends the question or estimates described beside its opt-in control. Keep identifying information out of free text. The repayment simulator calculates the figures.</p>
    </section>
    <Link className="workspace-text-link" to="/workspace">Open the offer workspace</Link>
  </div>;
}
