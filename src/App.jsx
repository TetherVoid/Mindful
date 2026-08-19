import Scene from './components/Scene'
import './App.css'

const projects = [
  {
    title: 'Project One',
    description: 'A short description of this project goes here.',
    link: '#',
  },
  {
    title: 'Project Two',
    description: 'A short description of this project goes here.',
    link: '#',
  },
  {
    title: 'Project Three',
    description: 'A short description of this project goes here.',
    link: '#',
  },
]

function App() {
  return (
    <>
      <section id="hero">
        <div className="scene-wrap">
          <Scene />
        </div>
        <div className="hero-overlay">
          <h1>Your Name</h1>
          <p className="tagline">Designer &amp; Developer — building things for the web</p>
          <a className="scroll-hint" href="#about">
            Scroll to explore ↓
          </a>
        </div>
      </section>

      <section id="about">
        <h2>About</h2>
        <p>
          A short bio goes here. Talk about who you are, what you do, and what
          you're interested in.
        </p>
      </section>

      <section id="projects">
        <h2>Projects</h2>
        <div className="project-grid">
          {projects.map((p) => (
            <a className="project-card" href={p.link} key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
            </a>
          ))}
        </div>
      </section>

      <section id="contact">
        <h2>Contact</h2>
        <p>
          Get in touch at <a href="mailto:you@example.com">you@example.com</a>
        </p>
      </section>
    </>
  )
}

export default App
