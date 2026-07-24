// Patch script: restore fetchSettings and add smtp/imap fields
import { readFileSync, writeFileSync } from 'fs';

const f = 'C:/Users/Coder/Desktop/Syntek/src/App.jsx';
let content = readFileSync(f, 'utf8');

// Replace the broken end of setSettings block
const broken = `          socialTwitter:      c.social_twitter    || prev.socialTwitter,
      } catch (e) {`;

const fixed = `          socialTwitter:      c.social_twitter    || prev.socialTwitter,
          workSamples:        c.work_samples      || prev.workSamples,
          senderLocation:     c.sender_location   || prev.senderLocation,
          searchMode:         c.search_mode       || prev.searchMode,
          autopilotMode:      c.autopilot_mode    || prev.autopilotMode,
          kanbanStages:       c.kanbanStages      || prev.kanbanStages,
          reResearchEnabled:  c.re_research_enabled ?? prev.reResearchEnabled,
          smtpHost:           c.smtp_host         ?? prev.smtpHost ?? null,
          smtpPort:           c.smtp_port         ?? prev.smtpPort ?? null,
          imapHost:           c.imap_host         ?? prev.imapHost ?? null,
          imapPort:           c.imap_port         ?? prev.imapPort ?? null,
        }));
        if (!c.gmail_user && !localStorage.getItem('syntek_onboarded')) {
          setShowOnboarding(true);
        }
      } catch (e) {`;

if (!content.includes(broken)) {
  console.error('Pattern not found!');
  process.exit(1);
}

content = content.replace(broken, fixed);
writeFileSync(f, content, 'utf8');
console.log('Fixed fetchSettings successfully');
