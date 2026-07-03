import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'logoCard',
  title: 'Logo Card',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'logoId',
      title: 'Logo ID',
      description: 'Stable machine ID used by inline paragraph annotations and frontend lookups.',
      type: 'string',
      validation: (Rule) =>
        Rule.required()
          .regex(/^[a-z0-9-]+$/, {
            name: 'token',
            invert: false
          })
          .error('Use lowercase letters, numbers, and dashes only.')
    }),
    defineField({
      name: 'orderRank',
      title: 'Order Rank',
      type: 'number',
      initialValue: 100
    }),
    defineField({
      name: 'caption',
      title: 'Caption',
      type: 'text',
      rows: 2
    }),
    defineField({
      name: 'color',
      title: 'Tooltip Color',
      type: 'string',
      initialValue: '#1a1a1a'
    }),
    defineField({
      name: 'link',
      title: 'Link URL',
      type: 'url'
    }),
    defineField({
      name: 'linkText',
      title: 'Link Label',
      type: 'string'
    }),
    defineField({
      name: 'logoFilePath',
      title: 'Logo File Path',
      description:
        'Fallback only. Relative file path in /public (for example logos/custom-logo.png).',
      type: 'string'
    }),
    defineField({
      name: 'logoAsset',
      title: 'Logo Asset',
      description: 'Primary source. Upload the logo image here.',
      type: 'image',
      options: {
        hotspot: true
      }
    })
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'logoId'
    }
  }
});
