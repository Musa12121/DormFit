import Modal from './Modal';
import { t } from '../i18n';

export const termsSections = [
  ['Planning, not a guarantee', 'DormFit helps you explore furniture arrangements. Layouts and 3D views are approximate. Check real measurements, walking space and opening doors before buying or moving furniture.'],
  ['AI is optional', 'You can use regular layouts without AI. When you enable AI and request a layout or note review, your room measurements, door and window positions, furniture details, relevant labels and note are sent through our backend to Google Gemini. Retries may send this information again.'],
  ['How Google may use AI data', 'On Google’s unpaid API services, your inputs and AI responses may be used to train and improve models, and human reviewers may read them. Different data-use terms can apply to paid services and some regions. Read Google’s terms below.'],
  ['What to leave out', 'Room dimensions alone do not usually identify you, but notes and labels can. Do not enter names, home addresses, passwords, payment details, health information or other personal or confidential information into AI requests. The AI feature is for adults aged 18 and over.'],
  ['Saving and deleting layouts', 'Your current room and saved layouts are stored in this browser, without DormFit encryption. Other people using this browser profile may see them. Delete saved rooms in My layouts, or clear this site’s browser data to remove local layouts. Downloaded files must be deleted separately. Clearing local data does not delete information already sent to Google.'],
  ['Using the service', 'Enter information you are allowed to use. Do not try to misuse the service or bypass request limits. AI can make mistakes or be unavailable. Turning AI off stops future AI requests; it does not undo earlier submissions.'],
] as const;

export default function TermsNotice({ onClose }: { onClose: () => void }) {
  return <Modal title="Terms & privacy" onClose={onClose} wide>
    <div className="terms-content">
      <p>{t('Updated: 18 October 2026. This notice explains how the current DormFit app works.')}</p>
      {termsSections.map(([title, body]) => <section key={title}><h3>{t(title)}</h3><p>{t(body)}</p></section>)}
      <p><a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">{t('Google Gemini API terms and data use')}</a></p>
    </div>
  </Modal>;
}
