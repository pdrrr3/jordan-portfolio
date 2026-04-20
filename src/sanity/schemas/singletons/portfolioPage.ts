import { defineArrayMember, defineField, defineType } from 'sanity';

export default defineType({
  name: 'portfolioPage',
  title: 'Portfolio Page',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Internal Label',
      type: 'string',
      initialValue: 'Jordan Portfolio',
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'navLabelPrimary',
      title: 'Nav Label Primary',
      type: 'string',
      initialValue: 'BRAND STRATEGY'
    }),
    defineField({
      name: 'navLabelSecondary',
      title: 'Nav Label Secondary',
      type: 'string',
      initialValue: 'NEW YORK'
    }),
    defineField({
      name: 'contactEmail',
      title: 'Contact Email',
      type: 'string',
      initialValue: 'hello@jordansowunmi.com'
    }),
    defineField({
      name: 'paragraphBlocks',
      title: 'Paragraphs',
      description:
        'WYSIWYG paragraphs. Highlight text and add inline annotation links to Logo Cards or Case Studies.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'block',
          styles: [{ title: 'Normal', value: 'normal' }],
          lists: [],
          marks: {
            decorators: [],
            annotations: [
              defineArrayMember({
                name: 'portfolioReference',
                title: 'Logo or Case Study Reference',
                type: 'object',
                fields: [
                  defineField({
                    name: 'reference',
                    title: 'Reference',
                    description: 'Link to a Logo Card or Case Study.',
                    type: 'reference',
                    to: [{ type: 'logoCard' }, { type: 'caseStudy' }],
                    validation: (Rule) => Rule.required()
                  })
                ]
              })
            ]
          }
        })
      ],
      validation: (Rule) => Rule.required().min(1)
    })
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'contactEmail'
    }
  }
});
