'use client'

export default function P2PremiumShell({children}) {
  return <div className="p2-premium-shell">
    <div className="p2-bg-orb p2-orb-a" />
    <div className="p2-bg-orb p2-orb-b" />
    <div className="p2-premium-content">{children}</div>
    <style jsx global>{`
      .p2-premium-shell{min-height:100%;position:relative;isolation:isolate;color:var(--text,#f7f7f7);background:radial-gradient(circle at 80% 0%,rgba(212,175,55,.08),transparent 32%),radial-gradient(circle at 0% 30%,rgba(20,184,166,.06),transparent 30%),var(--background,#080b14);overflow:hidden}
      .p2-premium-content{position:relative;z-index:2;max-width:1600px;margin:0 auto;padding:30px 30px 50px}
      .p2-bg-orb{position:absolute;z-index:0;filter:blur(70px);opacity:.22;pointer-events:none;border-radius:999px}.p2-orb-a{width:320px;height:320px;right:-120px;top:80px;background:rgba(234,179,8,.18)}.p2-orb-b{width:280px;height:280px;left:-140px;bottom:100px;background:rgba(20,184,166,.13)}
      .p2-premium-shell main{max-width:none!important;margin:0!important;padding:0!important;background:transparent!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .p2-premium-shell header{position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px;padding:26px 28px;border:1px solid rgba(255,255,255,.09);border-radius:24px;background:linear-gradient(135deg,rgba(255,255,255,.065),rgba(255,255,255,.025));box-shadow:0 20px 70px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.05);backdrop-filter:blur(18px)}
      .p2-premium-shell header h1{font-size:clamp(28px,3vw,44px)!important;line-height:1.04!important;letter-spacing:-.035em!important;margin:5px 0 9px!important;font-weight:900!important}.p2-premium-shell header p{max-width:850px!important;color:var(--muted,#9ca3af)!important;margin:0!important;line-height:1.6}
      .p2-premium-shell header small,.p2-premium-shell header .eyebrow{font-weight:900!important;letter-spacing:.14em!important;text-transform:uppercase;color:var(--primary,#d4af37)!important;font-size:10px!important}
      .p2-premium-shell .card,.p2-premium-shell article,.p2-premium-shell section:not(.p2-no-card){border:1px solid rgba(255,255,255,.08)!important;border-radius:20px!important;background:linear-gradient(145deg,rgba(255,255,255,.065),rgba(255,255,255,.025))!important;box-shadow:0 16px 45px rgba(0,0,0,.13),inset 0 1px 0 rgba(255,255,255,.04);backdrop-filter:blur(14px)}
      .p2-premium-shell .card{padding:20px!important}.p2-premium-shell article{padding:18px!important}
      .p2-premium-shell button,.p2-premium-shell .btn{border:1px solid rgba(255,255,255,.1)!important;border-radius:12px!important;padding:11px 15px!important;font-weight:850!important;color:var(--text,#fff)!important;background:rgba(255,255,255,.055)!important;box-shadow:0 8px 20px rgba(0,0,0,.12);transition:transform .16s ease,border-color .16s ease,background .16s ease,box-shadow .16s ease;cursor:pointer}
      .p2-premium-shell button:hover,.p2-premium-shell .btn:hover{transform:translateY(-1px);border-color:rgba(212,175,55,.5)!important;background:rgba(212,175,55,.09)!important;box-shadow:0 12px 26px rgba(0,0,0,.18)}
      .p2-premium-shell button:disabled{opacity:.5;transform:none;cursor:not-allowed}.p2-premium-shell .primary{background:linear-gradient(135deg,#d4af37,#f0d77a)!important;color:#15120a!important;border-color:rgba(240,215,122,.7)!important;box-shadow:0 12px 28px rgba(212,175,55,.16)}
      .p2-premium-shell input,.p2-premium-shell select,.p2-premium-shell textarea{box-sizing:border-box!important;width:100%;border:1px solid rgba(255,255,255,.1)!important;border-radius:12px!important;background:rgba(5,8,15,.52)!important;color:var(--text,#fff)!important;padding:12px 13px!important;outline:none!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
      .p2-premium-shell input:focus,.p2-premium-shell select:focus,.p2-premium-shell textarea:focus{border-color:rgba(212,175,55,.7)!important;box-shadow:0 0 0 3px rgba(212,175,55,.1)!important}
      .p2-premium-shell label{color:var(--muted,#9ca3af);font-weight:750}.p2-premium-shell h2{letter-spacing:-.02em}.p2-premium-shell small{color:var(--muted,#9ca3af)}
      .p2-premium-shell table{border-collapse:separate!important;border-spacing:0!important;overflow:hidden;border-radius:16px}.p2-premium-shell th{background:rgba(255,255,255,.045)!important;color:var(--muted,#aeb4c2)!important;font-size:11px!important;text-transform:uppercase;letter-spacing:.08em}.p2-premium-shell td,.p2-premium-shell th{border-bottom:1px solid rgba(255,255,255,.065)!important}.p2-premium-shell tbody tr:hover{background:rgba(255,255,255,.025)!important}
      .p2-premium-shell a{color:var(--primary,#d4af37)}.p2-premium-shell .msg,.p2-premium-shell .notice{border:1px solid rgba(212,175,55,.2)!important;border-radius:14px!important;background:rgba(212,175,55,.07)!important;color:var(--text,#fff)}
      .p2-premium-shell .empty{border:1px dashed rgba(255,255,255,.14)!important;border-radius:16px!important;background:rgba(255,255,255,.02)!important;padding:30px!important;color:var(--muted,#9ca3af)}
      @media(max-width:800px){.p2-premium-content{padding:18px 14px 35px}.p2-premium-shell header{padding:20px;align-items:stretch;flex-direction:column}.p2-premium-shell header .head-actions{width:100%}.p2-premium-shell header .head-actions .btn{flex:1}}
    `}</style>
  </div>
}
