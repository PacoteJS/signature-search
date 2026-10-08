import { RibbonFilter } from '@pacote/ribbon-filter'
import { xxh64 } from '@pacote/xxhash'
import { computed, signal } from '@preact/signals'
import cx from 'clsx'
import { Search } from './Search'

const h1 = xxh64(0)
const h2 = xxh64(1)

const toUint32 = (hex: string) => parseInt(hex.substring(8, 16), 16)

/** Enhanced double hashing: the i-th of any number of hashes from two xxHash64 digests. */
function hash(i: number, data: string): number {
  const d1 = toUint32(h1.update(data).digest('hex'))
  const d2 = toUint32(h2.update(data).digest('hex'))
  return d1 + i * d2 + i ** 3
}

const mask = (bits: number) => (bits === 32 ? 0xffffffff : (1 << bits) - 1)

/** What a word asks of the table: a start row, which rows after it to add up, and the answer it expects. */
function equation(word: string, size: number, bits: number) {
  const width = Math.min(32, size)
  const coefficients = ((hash(1, word) & mask(width)) | 1) >>> 0
  const rows: number[] = []
  const start = (hash(0, word) >>> 0) % (size - width + 1)
  for (let c = coefficients, i = start; c !== 0; c >>>= 1, i++)
    if (c & 1) rows.push(i)
  return { rows, fingerprint: (hash(2, word) & mask(bits)) >>> 0 }
}

/** Reads one `bits`-wide row from the packed table. */
function row(words: Uint32Array, i: number, bits: number): number {
  const offset = i * bits
  const word = Math.floor(offset / 32)
  const shift = offset % 32
  let value = words[word] >>> shift
  if (shift + bits > 32) value |= words[word + 1] << (32 - shift)
  return (value & mask(bits)) >>> 0
}

const binary = (value: number, bits: number) =>
  value.toString(2).padStart(bits, '0')

// One page per bundle, so the state can live at module level.
const bits = signal(4)
const words = signal<string[]>([])
const selected = signal(-1)
const searched = signal('')

/** A Ribbon filter is static: any change to the words builds a new one. */
const filter = computed(() =>
  words.value.length === 0
    ? undefined
    : new RibbonFilter<string>({
        fingerprintBits: bits.value,
        elements: words.value,
        hash,
      }),
)

const table = computed(() => {
  const f = filter.value
  return f
    ? Array.from({ length: f.size }, (_, i) => row(f.filter, i, bits.value))
    : []
})

const list = (items: number[]) =>
  items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/** Each swatch is a real cell with the same data attributes the grid uses, so the key cannot drift from it. */
const KEY = [
  { label: 'Set by the selected word', 'data-hit': 'true' },
  { label: 'Probed by the lookup', 'data-probe': 'set' },
  { label: 'Probed by the lookup, row empty', 'data-probe': 'unset' },
]

function Lookup() {
  const f = filter.value
  const word = searched.value
  if (!word) return null
  if (!f) return <p class="pt-3">Add a word first.</p>

  const { rows, fingerprint } = equation(word, f.size, bits.value)
  const sum = rows.reduce((acc, i) => acc ^ table.value[i], 0)
  const possible = f.has(word)
  const wanted = binary(fingerprint, bits.value)

  return (
    <p class="pt-3" aria-live="polite">
      {possible ? (
        <>
          <strong class="font-semibold">Possible match.</strong> Rows{' '}
          {list(rows)} add up (XOR) to {binary(sum, bits.value)}, which is the
          fingerprint of &ldquo;{word}&rdquo;
          {words.value.includes(word) ? (
            <>, and it was added.</>
          ) : (
            <>
              . It was never added, so this is a{' '}
              <strong class="font-semibold">false positive</strong>.
            </>
          )}
        </>
      ) : (
        <>
          <strong class="font-semibold">Certain miss.</strong> Rows {list(rows)}{' '}
          add up (XOR) to {binary(sum, bits.value)}, but the fingerprint of
          &ldquo;
          <s>{word}</s>&rdquo; is {wanted}, so it was never added.
        </>
      )}
    </p>
  )
}

/** A Ribbon filter you build from a list of words, then probe. */
export function RibbonDemo() {
  const f = filter.value
  const picked = words.value[selected.value]
  const hit = new Set(
    f && picked ? equation(picked, f.size, bits.value).rows : [],
  )
  const probe = new Set(
    f && searched.value
      ? equation(searched.value, f.size, bits.value).rows
      : [],
  )

  return (
    <div class="spread">
      <aside>
        <div class="pb-5">
          <label for="bits" class="label mb-1 block">
            Fingerprint (bits)
          </label>
          <input
            class="field"
            id="bits"
            type="number"
            min={1}
            max={8}
            value={bits}
            onChange={(event) => {
              const target = event.target as HTMLInputElement
              const n = parseInt(target.value, 10)
              // An empty or invalid field keeps the current value instead of breaking the filter.
              if (!Number.isNaN(n)) bits.value = Math.min(8, Math.max(1, n))
              target.value = String(bits.value)
            }}
          />
        </div>
        <ul>
          {words.value.map((word, index) => {
            const isSelected = index === selected.value
            return (
              <li
                key={word}
                class="flex items-baseline justify-between border-b border-rule"
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  class={cx(
                    'min-h-[2.75rem] flex-1 text-left',
                    isSelected
                      ? 'font-semibold text-accent'
                      : 'hover:text-accent',
                  )}
                  onClick={() => {
                    selected.value = isSelected ? -1 : index
                  }}
                >
                  {word}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${word}`}
                  class="min-h-[2.75rem] min-w-[2.75rem] text-ink-2 hover:text-accent"
                  onClick={() => {
                    words.value = words.value.filter((_, i) => i !== index)
                    selected.value = -1
                  }}
                >
                  &times;
                </button>
              </li>
            )
          })}
        </ul>
      </aside>
      <div>
        <div class="grid gap-x-8 lg:grid-cols-2">
          <Search
            id="add"
            label="Add a word"
            placeholder="e.g. whale"
            magnifier={false}
            type="text"
            onKeyUp={(event) => {
              if (event.key !== 'Enter') return
              const target = event.target as HTMLInputElement
              const word = target.value.trim()
              if (word.length === 0) return
              if (!words.value.includes(word))
                words.value = [...words.value, word]
              selected.value = words.value.indexOf(word)
              target.value = ''
            }}
          />
          <Search
            id="lookup"
            label="Look up a word"
            placeholder="e.g. whale"
            onInput={(event) => {
              searched.value = (event.target as HTMLInputElement).value.trim()
            }}
          >
            <Lookup />
          </Search>
        </div>

        <p class="pb-3 text-ink-2" aria-live="polite">
          {f
            ? `${words.value.length} ${words.value.length === 1 ? 'word' : 'words'} in ${f.size} rows of ${bits.value} bits: ${f.size * bits.value} bits. Adding or removing a word builds the filter again.`
            : 'Add a word to build the filter.'}
        </p>

        {f && (
          <ul aria-label="Key" class="flex flex-wrap gap-x-6 gap-y-2 pb-4">
            {KEY.map(({ label, ...state }) => (
              <li key={label} class="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  class="bit m-0 inline-block h-7 w-7 shrink-0"
                  {...state}
                />
                {label}
              </li>
            ))}
          </ul>
        )}

        <ul class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] pl-px pt-px">
          {table.value.map((value, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
              key={index}
              class="bit"
              data-set={value !== 0}
              data-hit={hit.has(index) ? 'true' : undefined}
              data-probe={
                probe.has(index) ? (value !== 0 ? 'set' : 'unset') : undefined
              }
            >
              <span class="readout absolute left-1 top-0.5 text-[0.65rem] leading-none opacity-80">
                {index}
              </span>
              <span class="readout absolute inset-0 grid place-items-center text-sm">
                {binary(value, bits.value)}
              </span>
            </li>
          ))}
        </ul>
        <p class="pt-4 text-ink-2">
          Each cell is one row of the table. A word is in the filter, as far as
          it can tell, when its rows add up (XOR) to its fingerprint.
        </p>
      </div>
    </div>
  )
}
