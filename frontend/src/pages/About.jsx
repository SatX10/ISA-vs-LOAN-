import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../theme/about.css';

export default function About() {
  return (
    <div className="about-page">
      <header className="page-header">
        <h1>About ISA Truth</h1>
        <p>A clearer way to decide how to pay for your education.</p>
      </header>
      <div className="about-layout">
        <section className="card about-creator" aria-labelledby="creator-name">
          <div className="about-avatar" role="img" aria-label="Illustrated creator avatar">🧑‍💻</div>
          <h2 id="creator-name">SatX10</h2>
          <p>Creator of ISA Truth</p>
        </section>
        <article className="card about-story">
          <h2 className="section-title">Why I built ISA Truth</h2>
          <p>
            Deciding how to pay for an education can feel like making a promise to your future self.
            You hope the course will open doors, and you wonder how much of your first paycheck
            will go toward paying it back.
          </p>
          <p>
            I built ISA Truth to help you put numbers to that decision. See what you’ll spend, weigh
            it against what you might earn, and compare what repayment would look like with
            an income share agreement or a loan.
          </p>
          <p>
            Try the salary you’re hoping for and one that’s a little lower. If the first job takes
            longer to find or pays less than you expected, it helps to know what you can still afford.
          </p>
          <Link to="/calculator" className="btn btn-secondary about-action">
            Compare repayment options <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </article>
      </div>
    </div>
  );
}
