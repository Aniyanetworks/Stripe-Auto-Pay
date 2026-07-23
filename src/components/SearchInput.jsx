export default function SearchInput({ value, onChange, placeholder = 'Search…', style }) {
  return (
    <input
      className="search-input"
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={style}
    />
  )
}
