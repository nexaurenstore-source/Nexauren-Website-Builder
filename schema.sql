CREATE TABLE IF NOT EXISTS faq_items (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS faq_items_category_idx ON faq_items(category);
CREATE INDEX IF NOT EXISTS faq_items_order_idx ON faq_items(sort_order);

INSERT OR IGNORE INTO faq_items(id,question,answer,category,sort_order,published,created_at,updated_at) VALUES
('faq-account','A minha conta é a mesma do Nexauren?','Sim. O Builder usa a autenticação da conta Nexauren e não cria uma segunda conta de utilizador.','account',10,strftime('%s','now'),strftime('%s','now'),strftime('%s','now')),
('faq-billing','Os planos e pagamentos são separados?','Não. O Builder consulta o catálogo de billing Nexauren, mantendo os mesmos planos e o mesmo sistema de pagamentos.','billing',20,1,strftime('%s','now'),strftime('%s','now')),
('faq-projects','Onde ficam os meus websites?','Os projetos do Website Builder ficam na base de dados própria do Builder e são associados ao ID da sua conta Nexauren.','projects',30,1,strftime('%s','now'),strftime('%s','now')),
('faq-editor','O editor visual já está disponível?','Esta primeira versão prepara a conta, billing, páginas legais e a fundação do Builder. O editor visual será ligado à mesma arquitetura de projetos, páginas, secções e elementos.','builder',40,1,strftime('%s','now'),strftime('%s','now'));
