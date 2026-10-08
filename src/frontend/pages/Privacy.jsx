import { DATA_REQUEST_CONTACT, privacySections, shortVersion } from '@frontend/content/privacy'
import Reveal from '@design/primitives/Reveal'
import { StaggerGroup, StaggerItem } from '@design/primitives/Stagger'

export default function Privacy() {
  return (
    <div className="folio">
      <Reveal as="header" className="folio-head" y={14} index={0}>
        <div>
          <p className="folio-kicker">Privacy</p>
          <h1 className="folio-title">
            What Mindful stores <em>and who can see it</em>
          </h1>
          <p className="folio-standfirst">
            Checked against the database rules, not written as a promise on top of them.
          </p>
        </div>
      </Reveal>

      <StaggerGroup base={0.05}>
        <StaggerItem as="section" className="panel" index={0} key="short">
          <div className="panel-head">
            <h2>The short version</h2>
          </div>
          {shortVersion.map((line) => (
            <p className="privacy-fact" key={line.text}>
              {line.text}
            </p>
          ))}
        </StaggerItem>
        {privacySections.map((section, i) => (
          <StaggerItem as="section" className="panel" index={i + 1} key={section.heading}>
            <div className="panel-head">
              <span className="panel-head-num">§ {String(i + 1).padStart(2, '0')}</span>
              <h2>{section.heading}</h2>
            </div>
            {section.items.map((item) => (
              <p className="privacy-fact" key={item.text}>
                {item.text}
                {item.link && (
                  <>
                    {' '}
                    <a href={item.link.href} target="_blank" rel="noreferrer">
                      {item.link.label}
                    </a>
                    .
                  </>
                )}
              </p>
            ))}
          </StaggerItem>
        ))}
        {DATA_REQUEST_CONTACT && (
          <StaggerItem as="section" className="panel" index={privacySections.length + 1} key="contact">
            <div className="panel-head">
              <span className="panel-head-num">§ {String(privacySections.length + 1).padStart(2, '0')}</span>
              <h2>Questions and requests</h2>
            </div>
            <p className="privacy-fact">
              To ask what is held about you, or to ask for something to be corrected or removed, write to{' '}
              {DATA_REQUEST_CONTACT}.
            </p>
          </StaggerItem>
        )}
      </StaggerGroup>
    </div>
  )
}
