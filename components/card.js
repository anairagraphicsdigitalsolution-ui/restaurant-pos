export default function Card({ children }) {
  return (
    <div style={{
      background: "#fff",
      padding: 20,
      borderRadius: 10,
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      marginBottom: 15
    }}>
      {children}
    </div>
  )
}