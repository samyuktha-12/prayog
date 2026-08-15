export default function Home({ navigate }) {
  return (
    <div>
      <h1>Virtual Science Lab</h1>
      <button onClick={() => navigate('setup')}>Start</button>
    </div>
  )
}
