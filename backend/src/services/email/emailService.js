/**
 * EmailService — abstração de provider
 * Provider ativo é controlado por EMAIL_PROVIDER no .env
 * Trocar de provider = mudar 1 variável, zero código
 */

const { Resend } = require('resend');

class EmailService {
  constructor() {
    this.provider = process.env.EMAIL_PROVIDER || 'resend';
    this.from     = process.env.EMAIL_FROM     || 'noreply@miniusadas.com.br';
    this.yanmarCC = process.env.EMAIL_YANMAR_ADMIN;

    if (this.provider === 'resend') {
      this.client = new Resend(process.env.EMAIL_API_KEY);
    }
    // Futuramente: 'sendgrid' | 'smtp' — sem alterar as chamadas abaixo
  }

  async send({ to, subject, html, cc }) {
    if (this.provider === 'resend') {
      return this.client.emails.send({
        from: this.from,
        to: Array.isArray(to) ? to : [to],
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
        subject,
        html,
      });
    }
    throw new Error(`Provider de e-mail não suportado: ${this.provider}`);
  }

  // ── Templates ──────────────────────────────

  async notifyAdminNewListing({ listing, dealer }) {
    return this.send({
      to: this.yanmarCC,
      subject: `[Miniusadas] Novo anúncio aguardando aprovação — ${listing.title}`,
      html: `
        <h2>Novo anúncio para aprovação</h2>
        <p><strong>Concessionária:</strong> ${dealer.name}</p>
        <p><strong>Equipamento:</strong> ${listing.title}</p>
        <p><strong>Categoria:</strong> ${listing.category}</p>
        <p><strong>Valor:</strong> R$ ${Number(listing.price).toLocaleString('pt-BR')}</p>
        <br>
        <a href="${process.env.APP_URL}/admin/anuncios/${listing.id}" 
           style="background:#d40000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
          Revisar e aprovar
        </a>
      `,
    });
  }

  async notifyDealerApproved({ listing, dealer }) {
    return this.send({
      to: dealer.email,
      subject: `[Miniusadas] Anúncio aprovado e publicado — ${listing.title}`,
      html: `
        <h2>Seu anúncio foi aprovado!</h2>
        <p>Olá, <strong>${dealer.name}</strong>!</p>
        <p>O anúncio <strong>${listing.title}</strong> foi aprovado pela YANMAR e já está publicado no portal.</p>
        <br>
        <a href="${process.env.APP_URL}/maquinas/${listing.id}"
           style="background:#d40000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
          Ver anúncio publicado
        </a>
      `,
    });
  }

  async notifyDealerRejected({ listing, dealer, reason }) {
    return this.send({
      to: dealer.email,
      subject: `[Miniusadas] Anúncio não aprovado — ${listing.title}`,
      html: `
        <h2>Anúncio não aprovado</h2>
        <p>Olá, <strong>${dealer.name}</strong>!</p>
        <p>O anúncio <strong>${listing.title}</strong> não foi aprovado pela YANMAR.</p>
        <p><strong>Motivo:</strong> ${reason}</p>
        <p>Acesse seu painel, realize os ajustes necessários e envie para aprovação novamente.</p>
        <br>
        <a href="${process.env.APP_URL}/painel/anuncios/${listing.id}"
           style="background:#d40000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
          Editar anúncio
        </a>
      `,
    });
  }

  async notifyDealerNewLead({ lead, listing, dealer }) {
    return this.send({
      to: dealer.email,
      cc: this.yanmarCC,
      subject: `[Miniusadas] Novo interesse em ${listing.title}`,
      html: `
        <h2>Novo lead gerado no portal</h2>
        <p><strong>Equipamento:</strong> ${listing.title}</p>
        <hr>
        <h3>Dados do interessado</h3>
        <p><strong>Nome:</strong> ${lead.name}</p>
        <p><strong>E-mail:</strong> ${lead.email}</p>
        <p><strong>Telefone:</strong> ${lead.phone || 'Não informado'}</p>
        <p><strong>Mensagem:</strong> ${lead.message || '—'}</p>
      `,
    });
  }
}

module.exports = new EmailService();
