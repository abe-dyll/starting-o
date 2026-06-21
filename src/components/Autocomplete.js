import { useState } from 'react';

export default function Autocomplete({ position, playerList, onSelect }) {
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState([]);

  const handleChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (value.length > 1) {
      // Filter our player master list by matching query string
      const matches = playerList.filter(player => 
        player.name.toLowerCase().includes(value.toLowerCase())
      );
      setFiltered(matches);
    } else {
      setFiltered([]);
    }
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={`Type ${position} name...`}
        className="w-full p-3 bg-gray-800 text-white border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {filtered.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg max-h-48 overflow-y-auto">
          {filtered.map((player) => (
            <li
              key={player.name}
              onClick={() => {
                onSelect(player.name);
                setQuery(player.name);
                setFiltered([]);
              }}
              className="p-3 text-sm text-gray-200 cursor-pointer hover:bg-gray-800"
            >
              {player.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
